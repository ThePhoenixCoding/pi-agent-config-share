export function createInputStash() {
  const stack = [];

  return {
    toggle(text) {
      if (text.length > 0) {
        stack.push(text);
        return { action: "stashed", text: "", value: text };
      }

      const restored = stack.pop();
      if (restored === undefined) {
        return { action: "noop", text: "", value: undefined };
      }

      return { action: "restored", text: restored, value: restored };
    },

    count() {
      return stack.length;
    },

    statusText() {
      const count = stack.length;
      if (count === 0) return undefined;
      return `Input stash: ${count} ${count === 1 ? "entry" : "entries"}`;
    },
  };
}
