declare module "node-zklib" {
  export default class ZKLib {
    constructor(ip: string, port: number, timeout: number, inport: number);
    createSocket(): Promise<void>;
    getUsers(): Promise<{ data?: Array<{ userId?: string; name?: string }> }>;
    getAttendances(): Promise<{ data?: Array<{ deviceUserId?: string; recordTime?: Date | string }> }>;
    disconnect(): Promise<void>;
  }
}
