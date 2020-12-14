export interface ILoggerService {
  log(string): Promise<void>;
  error(string): Promise<void>;
}
