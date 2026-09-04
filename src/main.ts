#!/bin/env node
import { program as p } from "commander";
import { Daemon } from "@/daemon";
import { logger } from "./lib/logger";
import { getBotToken, getChatId, setBotToken, setChatId } from "./conf";

const main = async () => {
  const program = p
    .name("termux-api-bot")
    .description("telegram bot for interacting with termux-api")
    .version("v0.3.0");

  const daemon = program.command("daemon").description("commands for daemon");

  daemon
    .command("start")
    .description("start the server")
    .action(async () => {
      await Daemon.start().match(
        (pid) => logger.info("daemon started", { pid }),
        (e) => {
          logger.error(e.log());
          logger.debug(e);
        },
      );
    });

  daemon
    .command("stop")
    .description("stop the daemon")
    .action(async () => {
      await Daemon.stop().match(
        () => logger.info("daemon stopped"),
        (e) => {
          logger.error(e.log());
          console.log(e);
          logger.debug(e);
        },
      );
    });

  daemon
    .command("status")
    .description("check status of the daemon")
    .action(async () => {
      const isRunning = await Daemon.status();
      if (isRunning) {
        logger.info("daemon running");
      } else {
        logger.warn("daemon not running");
      }
    });

  const config = program
    .command("config")
    .description("commands for configuration data");

  const botToken = config.command("bot_token");
  const chatId = config.command("chat_id");

  botToken.command("get").action(() => console.log(getBotToken()));
  botToken.command("set <string>").action((bot_token) => {
    setBotToken(bot_token);
  });

  chatId.command("get").action(() => console.log(getChatId()));
  chatId.command("set <string>").action((chat_id) => {
    setChatId(chat_id);
  });

  program.parse(process.argv);
};

main().then();
