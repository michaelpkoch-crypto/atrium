export class PromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptError";
  }
}

export class NoTasteMatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoTasteMatch";
  }
}
