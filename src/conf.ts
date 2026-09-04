import Conf from "conf";

type Config = {
  BOT_TOKEN: string;
  CHAT_ID: string;
};
const conf = new Conf<Config>({
  projectName: "termux-api-bot",
});

export const getBotToken = () => conf.get("BOT_TOKEN");
export const setBotToken = (botToken: string) =>
  conf.set("BOT_TOKEN", botToken);

export const getChatId = () => conf.get("CHAT_ID");
export const setChatId = (chatId: string) => conf.set("CHAT_ID", chatId);
