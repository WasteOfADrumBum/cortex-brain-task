// An error from Todoist, Google or another service, whose message is safe to show (it never carries a token,
// a secret URL or a request body). Routes answer 502 with the message. Files starting with "_" are not functions.
export class UpstreamError extends Error {}
