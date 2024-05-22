import OpenAI from 'openai';
import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  streamUI,
  createStreamableValue
} from 'ai/rsc';
import {
  spinner,
  BotCard,
  BotMessage,
  SystemMessage,
  Stock,
  Purchase
} from '@/components/stocks';
import { z } from 'zod';
import { EventsSkeleton } from '@/components/stocks/events-skeleton';
import { Events } from '@/components/stocks/events';
import { StocksSkeleton } from '@/components/stocks/stocks-skeleton';
import { Stocks } from '@/components/stocks/stocks';
import { StockSkeleton } from '@/components/stocks/stock-skeleton';
import {
  formatNumber,
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid
} from '@/lib/utils';
import { saveChat } from '@/app/actions';
import { SpinnerMessage, UserMessage } from '@/components/stocks/message';
import { Chat, Message } from '@/lib/types';
import { auth } from '@/auth';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
  
});

async function confirmPurchase(symbol: string, price: number, amount: number) {
  'use server';

  const aiState = getMutableAIState<typeof AI>();

  const purchasing = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        Purchasing {amount} ${symbol}...
      </p>
    </div>
  );

  const systemMessage = createStreamableUI(null);

  runAsyncFnWithoutBlocking(async () => {
    await sleep(1000);

    purchasing.update(
      <div className="inline-flex items-start gap-1 md:items-center">
        {spinner}
        <p className="mb-2">
          Purchasing {amount} ${symbol}... working on it...
        </p>
      </div>
    );

    await sleep(1000);

    purchasing.done(
      <div>
        <p className="mb-2">
          You have successfully purchased {amount} ${symbol}. Total cost:{' '}
          {formatNumber(amount * price)}
        </p>
      </div>
    );

    systemMessage.done(
      <SystemMessage>
        You have purchased {amount} shares of {symbol} at ${price}. Total cost ={' '}
        {formatNumber(amount * price)}.
      </SystemMessage>
    );

    aiState.done({
      ...aiState.get(),
      messages: [
        ...aiState.get().messages,
        {
          id: nanoid(),
          role: 'system',
          content: `[User has purchased ${amount} shares of ${symbol} at ${price}. Total cost = ${
            amount * price
          }]`
        }
      ]
    });
  });

  return {
    purchasingUI: purchasing.value,
    newMessage: {
      id: nanoid(),
      display: systemMessage.value
    }
  };
}

async function submitUserMessage(content: string) {
  'use server';

  const aiState = getMutableAIState<typeof AI>();

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  });

  try {
    // Create a new thread for the conversation
    const thread = await openai.beta.threads.create();

    // Create a textStream to manage the assistant's response
    let textStream: undefined | ReturnType<typeof createStreamableValue<string>>;
    let textNode: undefined | React.ReactNode;

    const updateTextStream = (content: string) => {
      if (!textStream) {
        textStream = createStreamableValue('');
        textNode = <BotMessage content={textStream.value} />;
      }

      textStream.update(content);
    };

    // Add the user's message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content
    });

    // Run the assistant on the thread
    let run = await openai.beta.threads.runs.createAndPoll(
      thread.id,
      {
        assistant_id: 'asst_LLM5oKBkS41QIduCEJmtN09e'
      }
    );

    if (run.status === 'completed') {
      // Fetch the messages from the completed run
      const messages = await openai.beta.threads.messages.list(run.thread_id);

      // Get the assistant's response from the messages
      const assistantMessage = messages.data.find(
        message => message.role === 'assistant'
      );

      if (assistantMessage && assistantMessage.content) {
        // Extract the assistant's text response
        let assistantResponse = assistantMessage.content
          .map(contentItem => JSON.stringify(contentItem))
          .join(' ');

          assistantResponse = assistantResponse
          .replace(/{"type":"text","text":{"value":"/g, '') 
          .replace(/","annotations":\[\]}}/g, '');

        // Update the AI state with the assistant's response
        aiState.update({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content: assistantResponse
            }
          ]
        });

        // Update the textStream with the assistant's response
        updateTextStream(assistantResponse);

        // Return the response to be displayed in the UI
        return {
          id: nanoid(),
          display: textNode
        };
      } 
    } 
  } catch (error) {
    console.error('Error communicating with the assistant API:', error);
    return null;
  }
}

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
    confirmPurchase
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  onGetUIState: async () => {
    'use server';

    const session = await auth();

    if (session && session.user) {
      const aiState = getAIState();

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState);
        return uiState;
      }
    } else {
      return;
    }
  },
  onSetAIState: async ({ state }) => {
    'use server';

    const session = await auth();

    if (session && session.user) {
      const { chatId, messages } = state;

      const createdAt = new Date();
      const userId = session.user.id as string;
      const path = `/chat/${chatId}`;

      const firstMessageContent = messages[0].content as string;
      const title = firstMessageContent.substring(0, 100);

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      };

      await saveChat(chat);
    } else {
      return;
    }
  }
});

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'tool' ? (
          message.content.map(tool => {
            return tool.toolName === 'listStocks' ? (
              <BotCard>
                {/* TODO: Infer types based on the tool result*/}
                {/* @ts-expect-error */}
                <Stocks props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPrice' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Stock props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'showStockPurchase' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Purchase props={tool.result} />
              </BotCard>
            ) : tool.toolName === 'getEvents' ? (
              <BotCard>
                {/* @ts-expect-error */}
                <Events props={tool.result} />
              </BotCard>
            ) : null;
          })
        ) : message.role === 'user' ? (
          <UserMessage>{message.content as string}</UserMessage>
        ) : message.role === 'assistant' &&
          typeof message.content === 'string' ? (
          <BotMessage content={message.content} />
        ) : null
    }));
};
