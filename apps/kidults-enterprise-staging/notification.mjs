import tls from "node:tls";

const DEFAULT_HOST = "smtp.gmail.com";
const DEFAULT_PORT = 465;
const DEFAULT_TIMEOUT_MS = 15000;

function required(value, name) {
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;
}

function normalizeLine(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function dotStuff(value) {
  return String(value).replace(/^\./gm, "..");
}

function messageForSubmission(submission, recipient) {
  const typeLabel = {
    newsletter: "Newsletter subscription",
    waitlist: "Enterprise waitlist request",
    inquiry: "Partnership inquiry"
  }[submission.type] || "Kidults conversion";

  const subject = `[Kidults] ${typeLabel}`;
  const lines = [
    "A new Kidults website conversion was accepted.",
    "",
    `Type: ${submission.type}`,
    `Submission ID: ${submission.id}`,
    `Received: ${submission.created_at}`,
    `Email: ${submission.email}`,
    `Organization: ${submission.organization || "Not provided"}`,
    `Interest: ${submission.interest || "Not provided"}`,
    "",
    "Environment: staging",
    "Source: Kidults conversion runtime"
  ];

  return {
    envelopeFrom: recipient,
    envelopeTo: recipient,
    raw: [
      `From: ${encodeHeader("Kidults Operations")} <${recipient}>`,
      `To: ${recipient}`,
      `Reply-To: ${normalizeLine(submission.email)}`,
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      `Message-ID: <${submission.id}@kidults.com>`,
      `Date: ${new Date(submission.created_at).toUTCString()}`,
      "",
      dotStuff(lines.join("\r\n"))
    ].join("\r\n")
  };
}

function createReplyReader(socket, timeoutMs) {
  let buffer = "";
  const queue = [];
  let waiter = null;

  const flush = () => {
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line) continue;
      queue.push(line);
    }
    if (waiter) waiter();
  };

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    flush();
  });

  return async function readReply() {
    const collected = [];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      while (queue.length) {
        const line = queue.shift();
        collected.push(line);
        if (/^\d{3} /.test(line)) {
          return {
            code: Number(line.slice(0, 3)),
            lines: collected
          };
        }
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiter = null;
          reject(new Error("smtp_timeout"));
        }, Math.max(1, deadline - Date.now()));
        waiter = () => {
          clearTimeout(timer);
          waiter = null;
          resolve();
        };
      });
    }
    throw new Error("smtp_timeout");
  };
}

async function expectReply(readReply, expected, stage) {
  const reply = await readReply();
  if (!expected.includes(reply.code)) {
    throw new Error(`smtp_${stage}_${reply.code}: ${reply.lines.join(" | ")}`);
  }
  return reply;
}

function writeLine(socket, value) {
  socket.write(`${value}\r\n`);
}

export function createSmtpNotifier(config) {
  const username = required(config.username, "KIDULTS_SMTP_USERNAME");
  const password = required(config.password, "KIDULTS_SMTP_APP_PASSWORD");
  const recipient = config.recipient || "partnerships@kidults.com";
  const host = config.host || DEFAULT_HOST;
  const port = Number(config.port || DEFAULT_PORT);
  const timeoutMs = Number(config.timeoutMs || DEFAULT_TIMEOUT_MS);

  return async function notify(submission) {
    const message = messageForSubmission(submission, recipient);
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    socket.setTimeout(timeoutMs);
    const readReply = createReplyReader(socket, timeoutMs);

    try {
      await new Promise((resolve, reject) => {
        socket.once("secureConnect", resolve);
        socket.once("error", reject);
        socket.once("timeout", () => reject(new Error("smtp_socket_timeout")));
      });

      await expectReply(readReply, [220], "greeting");
      writeLine(socket, "EHLO kidults.com");
      await expectReply(readReply, [250], "ehlo");
      writeLine(socket, "AUTH LOGIN");
      await expectReply(readReply, [334], "auth_login");
      writeLine(socket, Buffer.from(username, "utf8").toString("base64"));
      await expectReply(readReply, [334], "auth_username");
      writeLine(socket, Buffer.from(password, "utf8").toString("base64"));
      await expectReply(readReply, [235], "auth_password");
      writeLine(socket, `MAIL FROM:<${message.envelopeFrom}>`);
      await expectReply(readReply, [250], "mail_from");
      writeLine(socket, `RCPT TO:<${message.envelopeTo}>`);
      await expectReply(readReply, [250, 251], "rcpt_to");
      writeLine(socket, "DATA");
      await expectReply(readReply, [354], "data");
      socket.write(`${message.raw}\r\n.\r\n`);
      await expectReply(readReply, [250], "message");
      writeLine(socket, "QUIT");
      await expectReply(readReply, [221], "quit");
      return { ok: true, channel: "gmail_smtp", recipient };
    } finally {
      socket.destroy();
    }
  };
}

export function notifierFromEnvironment(env = process.env) {
  if (env.KIDULTS_NOTIFICATION_ENABLED !== "true") return null;
  return createSmtpNotifier({
    username: env.KIDULTS_SMTP_USERNAME,
    password: env.KIDULTS_SMTP_APP_PASSWORD,
    recipient: env.KIDULTS_NOTIFICATION_RECIPIENT || "partnerships@kidults.com",
    host: env.KIDULTS_SMTP_HOST || DEFAULT_HOST,
    port: env.KIDULTS_SMTP_PORT || DEFAULT_PORT,
    timeoutMs: env.KIDULTS_SMTP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS
  });
}
