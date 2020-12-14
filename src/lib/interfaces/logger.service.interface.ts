export interface ILoggerService {
  log(str: string): Promise<void>;
  error(str: string): Promise<void>;
}
