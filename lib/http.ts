export interface HttpResponse<TBody = string> {
  status: number;
  body?: TBody;
}
