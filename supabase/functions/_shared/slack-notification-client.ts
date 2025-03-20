function send(message: string) {
  const slackWebhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!slackWebhookUrl) {
    console.error(
      "SLACK_WEBHOOK_URL is not set. Notification will not be sent.",
    );
    return;
  }

  return fetch(slackWebhookUrl, {
    method: "POST",
    body: JSON.stringify({ text: message }),
  });
}

export const slackNotificationClient = {
  send,
};
