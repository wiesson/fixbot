"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Hash, Lock, Users } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  numMembers: number;
}

interface ChannelsStepProps {
  channels: Channel[];
  isLoading: boolean;
  onComplete: (selectedChannels: string[]) => void;
  onSkip: () => void;
}

export function ChannelsStep({ channels, isLoading, onComplete, onSkip }: ChannelsStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleChannel = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const handleContinue = () => {
    onComplete(Array.from(selected));
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center">
          <div className="animate-pulse text-muted-foreground">Loading channels...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Hash className="h-8 w-8 text-primary" />
        </div>
        <CardTitle>Select Channels</CardTitle>
        <CardDescription>
          Choose which Slack channels Herbot should monitor for tasks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {channels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No channels found.</p>
            <p className="text-sm mt-2">
              Invite Herbot to channels in Slack first, then refresh.
            </p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => toggleChannel(channel.id)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left",
                  selected.has(channel.id)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center",
                      selected.has(channel.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {selected.has(channel.id) && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {channel.isPrivate ? (
                      <Lock className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Hash className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{channel.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  {channel.numMembers}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1" onClick={onSkip}>
            Skip
          </Button>
          <Button
            className="flex-1"
            onClick={handleContinue}
            disabled={selected.size === 0 && channels.length > 0}
          >
            Continue ({selected.size} selected)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
