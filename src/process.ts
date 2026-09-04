import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

export const startProcessManager = () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/status") {
      res.writeHead(200, {
        "content-type": "application/json",
      });
      res.end(
        JSON.stringify({
          name: "termux-api-bot",
          status: "running",
        }),
      );

      return;
    }

    if (req.method === "GET" && url.pathname === "/kill") {
      setImmediate(() => process.exit());
      res.writeHead(200, {
        "content-type": "application/json",
      });

      res.end(
        JSON.stringify({
          name: "termux-api-bot",
          status: "not-running",
        }),
      );
    }
  });

  server.listen(9843);
};
