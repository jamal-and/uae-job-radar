// Prints the chat id to put in TELEGRAM_CHAT_ID. Send your bot any message first, then run
// `npm run chat-id` with TELEGRAM_BOT_TOKEN in .env.
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Set TELEGRAM_BOT_TOKEN in .env first.');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const data = (await response.json()) as {
  ok: boolean;
  description?: string;
  result: { message?: { chat: { id: number; first_name?: string; username?: string } } }[];
};
if (!data.ok) {
  console.error(`Telegram: ${data.description}`);
  process.exit(1);
}

const chats = new Map<number, string>();
for (const update of data.result) {
  const chat = update.message?.chat;
  if (chat) chats.set(chat.id, chat.username ? `@${chat.username}` : (chat.first_name ?? ''));
}
if (chats.size === 0) console.log('No messages yet. Send your bot a message in Telegram, then run this again.');
for (const [id, name] of chats) console.log(`TELEGRAM_CHAT_ID=${id}   ${name}`);
