import { useState } from 'react';
import { NumberFlow } from 'number-flow-react-native';
import { Button, ExampleLayout } from './ExampleUI';

const currencies = [
  { code: 'USD', locale: 'en-US', label: '$ USD' },
  { code: 'EUR', locale: 'de-DE', label: '€ EUR' },
  { code: 'JPY', locale: 'ja-JP', label: '¥ JPY' },
];

function randomize() {
  const amount = Math.floor(Math.random() * 9999) + 1;
  const index = Math.floor(Math.random() * currencies.length);
  return { amount, index };
}

export default function CurrencyFormatting() {
  const [{ amount, index }, setState] = useState(() => randomize());

  const currency = currencies[index];

  return (
    <ExampleLayout>
      <NumberFlow
        value={amount}
        format={{ style: 'currency', currency: currency.code }}
        locales={currency.locale}
        style={{ fontSize: 40, color: '#fff' }}
      />

      <Button title="Randomize" onPress={() => setState(randomize())} />
    </ExampleLayout>
  );
}
