export interface ILoggerService {
  log(str: string): Promise<any>;
  error(str: string): Promise<any>;
}
