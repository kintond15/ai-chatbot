import * as React from 'react';
import Textarea from 'react-textarea-autosize';
import { useActions, useUIState } from 'ai/rsc';
import { UserMessage } from './stocks/message';
import { Button } from '@/components/ui/button';
import { IconArrowElbow, IconPlus } from '@/components/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';
import { nanoid } from 'nanoid';
import { useRouter } from 'next/navigation';
import { AI } from '@/lib/chat/actions';

export function PromptForm({
  input,
  setInput,
}: {
  input: string;
  setInput: (value: string) => void;
}) {
  const router = useRouter();
  const { formRef, onKeyDown } = useEnterSubmit();
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { submitUserMessage } = useActions();
  const [_, setMessages] = useUIState<typeof AI>();
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const value = input.trim();
    setInput('');
    setSelectedFile(null);
    if (!value && !selectedFile) return;

    // Optimistically add user message UI
    setMessages((currentMessages: any) => [
      ...currentMessages,
      {
        id: nanoid(),
        display: <UserMessage>{value || (selectedFile ? selectedFile.name : '')}</UserMessage>,
      },
    ]);

    // Prepare file for submission
    let fileData = null;
    if (selectedFile) {
      const arrayBuffer = await selectedFile.arrayBuffer();
      fileData = { name: selectedFile.name, arrayBuffer };
    }

    // Submit and get response message
    try {
      const responseMessage = await submitUserMessage(value, fileData);
      setMessages((currentMessages: any) => [...currentMessages, responseMessage]);
    } catch (error) {
      console.error('Error submitting user message:', error);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <div className="relative flex max-h-60 w-full grow flex-col overflow-hidden bg-background px-8 sm:rounded-md sm:border sm:px-12">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="absolute left-0 top-[14px] size-8 rounded-full bg-background p-0 sm:left-4"
              onClick={() => {
                router.push('/new');
              }}
            >
              <IconPlus />
              <span className="sr-only">New Chat</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>New Chat</TooltipContent>
        </Tooltip>
        <Textarea
          ref={inputRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          placeholder="Send a message."
          className="min-h-[60px] w-full resize-none bg-transparent px-4 py-[1.3rem] focus-within:outline-none sm:text-sm"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          name="message"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="absolute right-0 top-[13px] sm:right-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit" size="icon" disabled={input === '' && !selectedFile}>
                <IconArrowElbow />
                <span className="sr-only">Send message</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={handleFileInputChange}
        />
        <Button
          size="icon"
          className="absolute right-10 top-[13px] sm:right-20"
          onClick={() => fileInputRef.current?.click()}
        >
          <IconPlus />
          <span className="sr-only">Upload file</span>
        </Button>
      </div>
    </form>
  );
}
