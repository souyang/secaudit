export class StepTimer {
  private start: bigint = 0n;

  begin(): void {
    this.start = process.hrtime.bigint();
  }

  elapsed(): number {
    const end = process.hrtime.bigint();
    return Number((end - this.start) / 1_000_000n);
  }
}
