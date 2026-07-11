import { Suspense } from 'react';
import { PaymentResult } from '../payment-result';

export default function PaymentSuccessPage() {
  return (
    <div className="relative min-h-screen bg-white dark:bg-gray-900">
      <Suspense>
        <PaymentResult kind="success" />
      </Suspense>
    </div>
  );
}
