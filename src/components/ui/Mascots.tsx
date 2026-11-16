import { Image, View } from 'react-native';

// The KYCO mascots (Shastri's artwork, supplied 2026-11-16): a male
// and a female fox in cricket kit. Shown as a pair - landing page,
// learner home greeting and the lesson-complete celebration - so the
// same friendly faces follow the student through the app.
// Assets are transparent PNGs, 540x960 (aspect 0.5625).

const MALE = require('../../../assets/images/mascot-male.png');
const FEMALE = require('../../../assets/images/mascot-female.png');

export default function MascotPair({ height = 120 }: { height?: number }) {
  const width = Math.round(height * 0.5625);
  return (
    <View className="flex-row items-end justify-center gap-2">
      <Image source={FEMALE} style={{ width, height }} resizeMode="contain" />
      <Image source={MALE} style={{ width, height }} resizeMode="contain" />
    </View>
  );
}
