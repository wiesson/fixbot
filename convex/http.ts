import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// ===========================================
// SLACK EVENTS WEBHOOK
// ===========================================

http.route({
  path: "/slack/events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    // Slack URL Verification Challenge
    if (body.type === "url_verification") {
      return new Response(body.challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Verify Slack signature (in production, validate signing secret)
    // const signature = request.headers.get("x-slack-signature");
    // const timestamp = request.headers.get("x-slack-request-timestamp");

    // Handle event callbacks - respond immediately, process async
    if (body.type === "event_callback") {
      const event = body.event;
      const teamId = body.team_id;

      // Bot mention: @taskbot in a channel
      if (event.type === "app_mention") {
        // Extract file attachments if present
        const files = event.files?.map((f: {
          id: string;
          name: string;
          mimetype: string;
          size: number;
          url_private: string;
        }) => ({
          id: f.id,
          name: f.name,
          mimetype: f.mimetype,
          size: f.size,
          url_private: f.url_private,
        }));

        // Schedule async processing to avoid Slack timeout
        await ctx.scheduler.runAfter(0, internal.slack.handleAppMention, {
          teamId,
          channelId: event.channel,
          userId: event.user,
          text: event.text,
          ts: event.ts,
          threadTs: event.thread_ts || event.ts,
          files,
        });
      }

      // Message in thread (for follow-up/clarification)
      if (
        event.type === "message" &&
        event.thread_ts &&
        !event.bot_id // Ignore bot's own messages
      ) {
        await ctx.scheduler.runAfter(0, internal.slack.handleThreadReply, {
          teamId,
          channelId: event.channel,
          userId: event.user,
          text: event.text,
          ts: event.ts,
          threadTs: event.thread_ts,
        });
      }
    }

    // Return 200 immediately - processing happens async
    return new Response("OK", { status: 200 });
  }),
});

// ===========================================
// SLACK OAUTH CALLBACK (for installing bot)
// ===========================================

http.route({
  path: "/slack/oauth/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(`Slack OAuth error: ${error}`, { status: 400 });
    }

    if (!code) {
      return new Response("Missing code parameter", { status: 400 });
    }

    try {
      // Exchange code for access token
      const response = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.SLACK_CLIENT_ID!,
          client_secret: process.env.SLACK_CLIENT_SECRET!,
          code,
          redirect_uri: `${process.env.CONVEX_SITE_URL}/slack/oauth/callback`,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        console.error("Slack OAuth error:", data);
        return new Response(`Slack OAuth failed: ${data.error}`, {
          status: 400,
        });
      }

      // Create or update workspace with Slack credentials
      await ctx.runMutation(internal.slack.createOrUpdateWorkspace, {
        slackTeamId: data.team.id,
        slackTeamName: data.team.name,
        slackBotToken: data.access_token,
        slackBotUserId: data.bot_user_id,
      });

      // Redirect to setup wizard
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      return Response.redirect(`${appUrl}/setup?step=channels&slack=connected`, 302);
    } catch (error) {
      console.error("Slack OAuth error:", error);
      return new Response("OAuth failed", { status: 500 });
    }
  }),
});

// ===========================================
// GITHUB WEBHOOK (PR updates from Claude)
// ===========================================

http.route({
  path: "/github/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const event = request.headers.get("x-github-event");
    const payload = await request.json();

    // TODO: Verify webhook signature with secret
    // const signature = request.headers.get("x-hub-signature-256");

    if (event === "pull_request") {
      const action = payload.action;
      const pr = payload.pull_request;
      const body = pr.body || "";

      // Extract task ID from PR body (TM-42, FIX-123, etc.)
      const taskIdMatch = body.match(/\*\*Task:\*\*\s*([A-Z]+-\d+)/);
      if (!taskIdMatch) {
        // Not a PR created from Fixbot, ignore
        return new Response("OK", { status: 200 });
      }

      const displayId = taskIdMatch[1];

      if (action === "opened") {
        // Claude opened a PR! Update task with PR info
        await ctx.runMutation(internal.github.updateTaskWithPR, {
          displayId,
          pullRequestNumber: pr.number,
          pullRequestUrl: pr.html_url,
        });

        // Post to Slack thread
        await ctx.scheduler.runAfter(0, internal.slack.postPRUpdate, {
          displayId,
          prNumber: pr.number,
          prUrl: pr.html_url,
          prTitle: pr.title,
          action: "opened",
        });
      }

      if (action === "closed" && pr.merged) {
        // PR was merged! Mark task as done
        await ctx.runMutation(internal.github.markTaskMerged, {
          displayId,
        });

        // Post to Slack thread
        await ctx.scheduler.runAfter(0, internal.slack.postPRUpdate, {
          displayId,
          prNumber: pr.number,
          prUrl: pr.html_url,
          prTitle: pr.title,
          action: "merged",
        });
      }
    }

    return new Response("OK", { status: 200 });
  }),
});

// ===========================================
// SLACK INTERACTIVITY (button clicks, modals)
// ===========================================

http.route({
  path: "/slack/interactivity",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const formData = await request.formData();
    const payload = JSON.parse(formData.get("payload") as string);

    // Handle different interaction types
    if (payload.type === "block_actions") {
      const action = payload.actions[0];

      // Task status update from Slack
      if (action.action_id.startsWith("task_status_")) {
        const [, , taskId, newStatus] = action.action_id.split("_");
        await ctx.runMutation(internal.slack.updateTaskStatus, {
          taskId,
          status: newStatus,
          slackUserId: payload.user.id,
        });
      }
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;
