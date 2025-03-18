export interface ServiceFailedResponseBody {
  success: false;
  error: string;
}

export interface ServiceSuccessResponseBody<T = never> {
  success: true;
  data: T;
}

export type ServiceResponseBody<T = never> =
  | ServiceFailedResponseBody
  | ServiceSuccessResponseBody<T>;

export class ServiceResponse<T = never> extends Response {
  constructor(
    serviceResponseBody: ServiceResponseBody<T>,
    responseInit?: ResponseInit,
  ) {
    super(JSON.stringify(serviceResponseBody), {
      headers: { "Content-Type": "application/json" },
      ...responseInit,
    });
  }
}
