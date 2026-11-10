type ClockUser = { userId?: string; name?: string };
type ClockPunch = { deviceUserId?: string; recordTime?: Date | string };

export type HqClockUser = { devicePin: string; name: string };
export type HqClockPunch = { devicePin: string; at: string };

function clean(value: unknown) {
  return String(value ?? "").replace(/\0/g, "").trim();
}

export async function readHqClock(host = process.env.HQ_CLOCK_HOST || "192.168.1.201", port = Number(process.env.HQ_CLOCK_PORT || 4370)) {
  const { default: ZKLib } = await import("node-zklib");
  const zk = new ZKLib(host, port, 8000, 4000);
  try {
    await zk.createSocket();
    const users = await zk.getUsers();
    const logs = await zk.getAttendances();
    const people: HqClockUser[] = ((users?.data ?? []) as ClockUser[])
      .map((person) => ({ devicePin: clean(person.userId), name: clean(person.name) }))
      .filter((person) => person.devicePin);
    const punches: HqClockPunch[] = ((logs?.data ?? []) as ClockPunch[])
      .map((punch) => {
        const at = punch.recordTime instanceof Date ? punch.recordTime.toISOString() : clean(punch.recordTime);
        return { devicePin: clean(punch.deviceUserId), at };
      })
      .filter((punch) => punch.devicePin && punch.at);
    return { people, punches };
  } finally {
    try {
      await zk.disconnect();
    } catch {
      // The socket may already be closed.
    }
  }
}
