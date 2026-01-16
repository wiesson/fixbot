"use client";

import { useState, useRef } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Paperclip, Send, X } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
  attachments?: string[];
};

export default function BotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [files, setFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessageAction = useAction(api.web.chat);
  const generateUploadUrl = useMutation(api.web.generateUploadUrl);

  const handleSend = async () => {
    if ((!input.trim() && files.length === 0) || isLoading) return;

    const userMessage = input;
    const currentFiles = [...files];
    
    // Optimistic Update
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage, attachments: currentFiles.map(f => f.name) },
    ]);
    setInput("");
    setFiles([]);
    setIsLoading(true);

    try {
      // 1. Upload Files if any
      const attachmentIds: string[] = [];
      if (currentFiles.length > 0) {
        const postUrl = await generateUploadUrl();
        
        await Promise.all(
          currentFiles.map(async (file) => {
            const result = await fetch(postUrl, {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            });
            const { storageId } = await result.json();
            attachmentIds.push(storageId);
          })
        );
      }

      // 2. Send Message to Agent
      const response = await sendMessageAction({
        message: userMessage,
        attachmentIds,
        threadId,
        pageUrl: window.location.href,
      });

      setThreadId(response.threadId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.text },
      ]);
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
      // specific scroll or generic
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center bg-gray-50 p-4">
      <Card className="flex h-full w-full max-w-2xl flex-col shadow-xl">
        {/* Header */}
        <div className="border-b p-4 bg-white rounded-t-xl">
          <h1 className="text-xl font-bold text-gray-800">Fixbot Web Agent</h1>
          <p className="text-sm text-gray-500">
            Agnostic Task Manager • Drop images to attach
          </p>
        </div>

        {/* Chat Area */}
        <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-gray-300">
                <p>No messages yet. Start a conversation!</p>
              </div>
            )}
            
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {msg.attachments && msg.attachments.length > 0 && (
                     <div className="mb-2 space-y-1">
                       {msg.attachments.map((name, idx) => (
                         <div key={idx} className="flex items-center text-xs opacity-75">
                           <Paperclip className="mr-1 h-3 w-3" /> {name}
                         </div>
                       ))}
                     </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl bg-gray-100 px-4 py-3 text-gray-400">
                   <div className="flex items-center gap-2">
                     <Loader2 className="h-4 w-4 animate-spin" />
                     Thinking...
                   </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div 
          className="bg-white p-4 border-t rounded-b-xl"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        >
          {/* File Preview */}
          {files.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
              {files.map((file, i) => (
                <div key={i} className="relative flex items-center gap-2 rounded-md bg-gray-100 px-3 py-1 text-sm">
                  <span className="truncate max-w-[100px]">{file.name}</span>
                  <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3 text-gray-500 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
               <Input
                placeholder="Type a message or drop images..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                className="pr-10"
              />
              <button 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input 
                id="file-upload" 
                type="file" 
                multiple 
                className="hidden" 
                onChange={(e) => e.target.files && setFiles(prev => [...prev, ...Array.from(e.target.files!)])}
              />
            </div>
            
            <Button onClick={handleSend} disabled={isLoading || (!input && files.length === 0)}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-center text-gray-300 mt-2">
            Drag & Drop images supported
          </p>
        </div>
      </Card>
    </div>
  );
}
