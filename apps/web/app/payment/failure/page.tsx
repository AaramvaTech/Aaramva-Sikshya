import { Suspense } from 'react';
import { PaymentResult } from '../payment-result';

export default function PaymentFailurePage() {
  return (
    <div className="relative min-h-screen bg-white dark:bg-gray-900">
      <Suspense>
        <PaymentResult kind="failure" />
      </Suspense>
    </div>
  );
}
