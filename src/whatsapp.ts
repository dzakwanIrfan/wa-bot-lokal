import qrcode from "qrcode-terminal";
import whatsapp from "whatsapp-web.js";

const { Client, LocalAuth } = whatsapp;

export function createWhatsAppClient() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
    puppeteer: { channel: "chrome", headless: true },
  });

  client.on("qr", (qr) => {
    console.log("Scan this QR from WhatsApp > Settings > Linked Devices:");
    qrcode.generate(qr, { small: true });
  });
  client.once("ready", () => console.log("WhatsApp bot is ready."));
  client.on("auth_failure", (message) =>
    console.error(`WhatsApp authentication failed: ${message}`),
  );
  client.on("disconnected", (reason) =>
    console.warn(`WhatsApp disconnected: ${reason}`),
  );

  return client;
}
