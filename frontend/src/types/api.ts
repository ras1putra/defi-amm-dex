export interface ApiErrorResponse {
  message: string;
  data: null;
  code?: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}
