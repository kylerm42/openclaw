/**
 * Standard Matrix SAS emoji list (64 emoji).
 * Source: https://spec.matrix.org/v1.11/client-server-api/#sas-method-emoji
 *
 * Each emoji is identified by an index (0-63) and has a standard name and emoji character.
 * The order is fixed and must not be changed.
 */

export interface SasEmojiDefinition {
  emoji: string;
  name: string;
}

/**
 * The 64 standard SAS emoji as defined by the Matrix spec.
 * Index in this array corresponds to the 6-bit value computed from HKDF output.
 */
export const SAS_EMOJI: readonly SasEmojiDefinition[] = [
  { emoji: "🐶", name: "Dog" },
  { emoji: "🐱", name: "Cat" },
  { emoji: "🦁", name: "Lion" },
  { emoji: "🐎", name: "Horse" },
  { emoji: "🦄", name: "Unicorn" },
  { emoji: "🐷", name: "Pig" },
  { emoji: "🐘", name: "Elephant" },
  { emoji: "🐰", name: "Rabbit" },
  { emoji: "🐼", name: "Panda" },
  { emoji: "🐓", name: "Rooster" },
  { emoji: "🐧", name: "Penguin" },
  { emoji: "🐢", name: "Turtle" },
  { emoji: "🐟", name: "Fish" },
  { emoji: "🐙", name: "Octopus" },
  { emoji: "🦋", name: "Butterfly" },
  { emoji: "🌷", name: "Flower" },
  { emoji: "🌳", name: "Tree" },
  { emoji: "🌵", name: "Cactus" },
  { emoji: "🍄", name: "Mushroom" },
  { emoji: "🌏", name: "Globe" },
  { emoji: "🌙", name: "Moon" },
  { emoji: "☁️", name: "Cloud" },
  { emoji: "🔥", name: "Fire" },
  { emoji: "🍌", name: "Banana" },
  { emoji: "🍎", name: "Apple" },
  { emoji: "🍓", name: "Strawberry" },
  { emoji: "🌽", name: "Corn" },
  { emoji: "🍕", name: "Pizza" },
  { emoji: "🎂", name: "Cake" },
  { emoji: "❤️", name: "Heart" },
  { emoji: "😀", name: "Smiley" },
  { emoji: "🤖", name: "Robot" },
  { emoji: "🎩", name: "Hat" },
  { emoji: "👓", name: "Glasses" },
  { emoji: "🔧", name: "Spanner" },
  { emoji: "🎅", name: "Santa" },
  { emoji: "👍", name: "Thumbs Up" },
  { emoji: "☂️", name: "Umbrella" },
  { emoji: "⌚", name: "Hourglass" },
  { emoji: "⏰", name: "Clock" },
  { emoji: "🎁", name: "Gift" },
  { emoji: "💡", name: "Light Bulb" },
  { emoji: "📕", name: "Book" },
  { emoji: "✏️", name: "Pencil" },
  { emoji: "📎", name: "Paperclip" },
  { emoji: "✂️", name: "Scissors" },
  { emoji: "🔒", name: "Lock" },
  { emoji: "🔑", name: "Key" },
  { emoji: "🔨", name: "Hammer" },
  { emoji: "☎️", name: "Telephone" },
  { emoji: "🏁", name: "Flag" },
  { emoji: "🚂", name: "Train" },
  { emoji: "🚲", name: "Bicycle" },
  { emoji: "✈️", name: "Aeroplane" },
  { emoji: "🚀", name: "Rocket" },
  { emoji: "🏆", name: "Trophy" },
  { emoji: "⚽", name: "Ball" },
  { emoji: "🎸", name: "Guitar" },
  { emoji: "🎺", name: "Trumpet" },
  { emoji: "🔔", name: "Bell" },
  { emoji: "⚓", name: "Anchor" },
  { emoji: "🎧", name: "Headphones" },
  { emoji: "📁", name: "Folder" },
  { emoji: "📌", name: "Pin" },
] as const;

/**
 * Validate that the emoji list has exactly 64 entries.
 * This is verified at runtime.
 */
if (SAS_EMOJI.length !== 64) {
  throw new Error(`SAS emoji list must have exactly 64 entries, got ${SAS_EMOJI.length}`);
}
