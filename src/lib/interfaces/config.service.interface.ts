export interface Config {
  readonly rabbitHost: string;
  readonly rabbitUser: string;
  readonly rabbitPassword: string;
  readonly rabbitVHost: string;
  readonly rabbitHeartbeat: number;
  readonly rabbitPort: number;
  readonly rabbitPrefetch: number;
}

export interface IConfigService {
  getConfig(): Config;
}
