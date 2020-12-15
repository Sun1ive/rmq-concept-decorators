export interface ILoggerService {
  log(data: any): Promise<any>;
  error(data: any): Promise<any>;
}
