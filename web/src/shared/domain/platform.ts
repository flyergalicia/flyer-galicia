/** On a Mac the shortcuts are with Cmd; everywhere else, with Ctrl. */
export function isApplePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/.test(platform);
}
