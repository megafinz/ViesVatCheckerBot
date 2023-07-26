import * as vies from '@/lib/vies';

export async function init() {
  await vies.init();
  console.log('VIES client initialized');
}
