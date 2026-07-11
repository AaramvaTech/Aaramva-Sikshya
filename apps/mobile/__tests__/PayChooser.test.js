/**
 * PAY-2 verification 6: the pay chooser renders one button per ENABLED
 * gateway — two-option chooser when both are configured, single button when
 * one is, nothing when none. Text-render proof via react-test-renderer.
 */
const React = require('react');
const renderer = require('react-test-renderer');

jest.mock('../lib/theme/colors', () => ({
  useThemeColors: () => ({
    primary: '#0B6B43',
    primaryForeground: '#FFFFFF',
  }),
}));

const { PayChooser } = require('../components/ui/PayChooser');

function render(gateways, payingWith = null) {
  let tree;
  renderer.act(() => {
    tree = renderer.create(
      React.createElement(PayChooser, {
        balanceLabel: 'NPR 600',
        gateways,
        payingWith,
        onPay: () => {},
      }),
    );
  });
  return tree;
}

function textOf(tree) {
  return JSON.stringify(tree.toJSON());
}

describe('PayChooser', () => {
  it('renders a two-option chooser when BOTH gateways are enabled', () => {
    const tree = render({ esewa: true, khalti: true });
    const text = textOf(tree);
    expect(text).toContain('Pay NPR 600 with eSewa');
    expect(text).toContain('Pay NPR 600 with Khalti');
  });

  it('renders a single eSewa button when only eSewa is enabled', () => {
    const tree = render({ esewa: true, khalti: false });
    const text = textOf(tree);
    expect(text).toContain('Pay NPR 600 with eSewa');
    expect(text).not.toContain('Khalti');
  });

  it('renders a single Khalti button when only Khalti is enabled', () => {
    const tree = render({ esewa: false, khalti: true });
    const text = textOf(tree);
    expect(text).toContain('Pay NPR 600 with Khalti');
    expect(text).not.toContain('eSewa');
  });

  it('renders nothing when no gateway is enabled', () => {
    const tree = render({ esewa: false, khalti: false });
    expect(tree.toJSON()).toBeNull();
  });
});
