// Static audio assets: Metro resolves these imports to asset ids,
// which expo-audio's createAudioPlayer accepts as a source. (Image
// imports in this codebase go through require(); this declaration
// covers the one bundled sound effect.)
declare module '*.wav' {
  const asset: number;
  export default asset;
}
