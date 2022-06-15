export interface ILoggerService {
  log(...data: any[]): Promise<void> | void;
  error(...data: any[]): Promise<void> | void;
}
