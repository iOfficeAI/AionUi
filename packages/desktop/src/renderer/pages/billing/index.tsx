import { Button, Input } from '@arco-design/web-react';
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  Coins,
  ClipboardPaste,
  Copy,
  ExternalLink,
  History,
  PlusCircle,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { openExternalUrl } from '@/renderer/utils/platform';
import billingStyles from './BillingPage.module.css';

type BillingTier = {
  price: number;
  points: number;
  bonusPoints: number;
  nameKey: string;
  descriptionKey: string;
  tagKey?: string;
  unitPriceKey: string;
  popular?: boolean;
};

const tiers: BillingTier[] = [
  {
    price: 5,
    points: 200,
    bonusPoints: 0,
    nameKey: 'billing.tierTrialName',
    descriptionKey: 'billing.tierTrialDescription',
    unitPriceKey: 'billing.tierTrialUnitPrice',
  },
  {
    price: 15,
    points: 650,
    bonusPoints: 50,
    nameKey: 'billing.tierLightName',
    descriptionKey: 'billing.tierLightDescription',
    tagKey: 'billing.tierLightTag',
    unitPriceKey: 'billing.tierLightUnitPrice',
  },
  {
    price: 30,
    points: 1500,
    bonusPoints: 300,
    nameKey: 'billing.tierSemesterName',
    descriptionKey: 'billing.tierSemesterDescription',
    tagKey: 'billing.tierSemesterTag',
    unitPriceKey: 'billing.tierSemesterUnitPrice',
  },
  {
    price: 50,
    points: 2800,
    bonusPoints: 800,
    nameKey: 'billing.tierAdvancedName',
    descriptionKey: 'billing.tierAdvancedDescription',
    tagKey: 'billing.tierAdvancedTag',
    unitPriceKey: 'billing.tierAdvancedUnitPrice',
  },
  {
    price: 100,
    points: 6500,
    bonusPoints: 2500,
    nameKey: 'billing.tierMasterName',
    descriptionKey: 'billing.tierMasterDescription',
    tagKey: 'billing.tierMasterTag',
    unitPriceKey: 'billing.tierMasterUnitPrice',
    popular: true,
  },
  {
    price: 200,
    points: 15000,
    bonusPoints: 7000,
    nameKey: 'billing.tierResearchName',
    descriptionKey: 'billing.tierResearchDescription',
    tagKey: 'billing.tierResearchTag',
    unitPriceKey: 'billing.tierResearchUnitPrice',
  },
  {
    price: 300,
    points: 25000,
    bonusPoints: 13000,
    nameKey: 'billing.tierFlagshipName',
    descriptionKey: 'billing.tierFlagshipDescription',
    tagKey: 'billing.tierFlagshipTag',
    unitPriceKey: 'billing.tierFlagshipUnitPrice',
  },
  {
    price: 500,
    points: 50000,
    bonusPoints: 30000,
    nameKey: 'billing.tierUltimateName',
    descriptionKey: 'billing.tierUltimateDescription',
    tagKey: 'billing.tierUltimateTag',
    unitPriceKey: 'billing.tierUltimateUnitPrice',
  },
];

const XIANYU_PURCHASE_URL = 'https://www.goofish.com';

const BillingPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, redeemCredits } = useAuth();
  const [selectedPrice, setSelectedPrice] = useState(100);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const selectedTier = useMemo(() => tiers.find((tier) => tier.price === selectedPrice) ?? tiers[4], [selectedPrice]);
  const numberFormat = useMemo(() => new Intl.NumberFormat(), []);

  const copyPurchaseLink = async () => {
    try {
      await navigator.clipboard.writeText(XIANYU_PURCHASE_URL);
    } catch {
      // The copied state still provides deterministic feedback if clipboard access is denied.
    }
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2500);
  };

  const pasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setRedeemCode(text.trim());
    } catch {
      setStatus({ type: 'error', text: t('billing.pasteUnavailable') });
    }
  };

  const handleRedeem = async () => {
    const code = redeemCode.trim();
    if (!code) {
      setStatus({ type: 'error', text: t('billing.emptyCode') });
      return;
    }
    if (code.length < 6) {
      setStatus({ type: 'error', text: t('billing.invalidCode') });
      return;
    }
    setRedeeming(true);
    setStatus(null);
    const result = await redeemCredits(code);
    setRedeeming(false);
    if (result.success) {
      setRedeemCode('');
      setStatus({
        type: 'success',
        text: t('billing.redeemSuccess', {
          quota: numberFormat.format(result.quota ?? user?.quota ?? 0),
        }),
      });
    } else {
      setStatus({ type: 'error', text: result.message ?? t('billing.redeemFailed') });
    }
  };

  return (
    <div className={billingStyles.page}>
      <main className={billingStyles.main}>
        <section className={billingStyles.balanceCard}>
          <div className={billingStyles.balanceIdentity}>
            <div className={billingStyles.balanceIcon}>
              <Coins size={28} />
            </div>
            <div>
              <div className={billingStyles.balanceLabel}>{t('billing.currentBalance')}</div>
              <div className={billingStyles.balanceValueRow}>
                <span className={billingStyles.balanceValue}>{numberFormat.format(user?.quota ?? 0)}</span>
                <span className={billingStyles.balanceUnit}>{t('billing.pointsWithEnglish')}</span>
              </div>
            </div>
          </div>
          <div className={billingStyles.balanceStats}>
            <div>
              <div className={billingStyles.statLabel}>
                <Activity size={14} />
                <span>{t('billing.totalConsumed')}</span>
              </div>
              <div className={billingStyles.statValue}>{t('billing.unknownValue')}</div>
              <div className={billingStyles.statNote}>{t('billing.consumeNote')}</div>
            </div>
            <div>
              <div className={`${billingStyles.statLabel} ${billingStyles.statLabelRecharged}`}>
                <TrendingUp size={14} />
                <span>{t('billing.totalRecharged')}</span>
              </div>
              <div className={`${billingStyles.statValue} ${billingStyles.statValueRecharged}`}>
                {t('billing.unknownValue')}
              </div>
              <div className={billingStyles.statNote}>{t('billing.rechargeNote')}</div>
            </div>
          </div>
        </section>

        <div className={billingStyles.contentGrid}>
          <section className={billingStyles.plansColumn}>
            <div className={billingStyles.plansHeading}>
              <div className={billingStyles.plansTitle}>
                <PlusCircle size={20} />
                <h2>{t('billing.choosePlan')}</h2>
              </div>
              <span>{t('billing.choosePlanHint')}</span>
            </div>
            <div className={billingStyles.planGrid}>
              {tiers.map((tier) => {
                const selected = tier.price === selectedPrice;
                return (
                  <Button
                    key={tier.price}
                    type='text'
                    className={`${billingStyles.planCard} ${selected ? billingStyles.planCardSelected : ''}`}
                    onClick={() => setSelectedPrice(tier.price)}
                  >
                    {tier.tagKey && (
                      <span className={`${billingStyles.planTag} ${tier.popular ? billingStyles.planTagPopular : ''}`}>
                        {t(tier.tagKey)}
                      </span>
                    )}
                    <span className={billingStyles.planTop}>
                      <span className={billingStyles.planName}>{t(tier.nameKey)}</span>
                      <span className={billingStyles.planRadio}>
                        {selected && <Check className={billingStyles.planRadioIcon} size={8} strokeWidth={3} />}
                      </span>
                    </span>
                    <span className={billingStyles.planPriceRow}>
                      <span className={billingStyles.planPrice}>¥{tier.price}</span>
                      <span className={billingStyles.planPoints}>
                        / {numberFormat.format(tier.points)}
                        {t('billing.pointShort')}
                      </span>
                    </span>
                    <span className={tier.bonusPoints > 0 ? billingStyles.planBonus : billingStyles.planStandard}>
                      {tier.bonusPoints > 0
                        ? t('billing.bonusPoints', { points: numberFormat.format(tier.bonusPoints) })
                        : t('billing.standardTier')}
                    </span>
                    <span className={billingStyles.planDescription}>{t(tier.descriptionKey)}</span>
                    <span className={billingStyles.planFooter}>
                      <span>{t(tier.unitPriceKey)}</span>
                      <span>{t('billing.neverExpires')}</span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </section>

          <aside className={billingStyles.checkoutColumn}>
            <section className={`${billingStyles.actionCard} ${billingStyles.purchaseCard}`}>
              <div className={`${billingStyles.cornerTag} ${billingStyles.purchaseCornerTag}`}>
                {t('billing.purchaseCornerTag')}
              </div>
              <div className={`${billingStyles.actionHeader} ${billingStyles.purchaseHeader}`}>
                <span className={`${billingStyles.stepBadge} ${billingStyles.purchaseBadge}`}>STEP 01</span>
                <span>{t('billing.purchaseTitle')}</span>
              </div>
              <div className={billingStyles.selectedSummary}>
                <div className={billingStyles.selectedSummaryLabelRow}>
                  <span>{t('billing.currentPlan')}</span>
                  <span className={billingStyles.selectedPlanName}>{t(selectedTier.nameKey)}</span>
                </div>
                <div className={billingStyles.selectedPriceRow}>
                  <span className={billingStyles.selectedPrice}>¥{selectedTier.price}</span>
                  <span className={billingStyles.selectedPoints}>
                    {numberFormat.format(selectedTier.points)} {t('billing.pointsUnit')}
                  </span>
                </div>
                {selectedTier.bonusPoints > 0 && (
                  <div className={billingStyles.selectedBonus}>
                    <Sparkles size={14} />
                    <span>
                      {t('billing.selectedBonus', {
                        points: numberFormat.format(selectedTier.bonusPoints),
                      })}
                    </span>
                  </div>
                )}
              </div>
              <div className={billingStyles.purchaseActions}>
                <Button
                  type='text'
                  className={billingStyles.purchaseButton}
                  onClick={async (): Promise<void> => {
                    await openExternalUrl(XIANYU_PURCHASE_URL).catch((): undefined => undefined);
                  }}
                >
                  <ShoppingBag size={20} />
                  <span>{t('billing.buyOnXianyu', { price: selectedTier.price })}</span>
                  <ExternalLink size={16} />
                </Button>
                <Button type='text' className={billingStyles.copyButton} onClick={() => void copyPurchaseLink()}>
                  {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedLink ? t('billing.linkCopied') : t('billing.copyProductLink')}</span>
                </Button>
              </div>
              <p className={billingStyles.purchaseNote}>{t('billing.purchaseNote')}</p>
            </section>

            <section className={`${billingStyles.actionCard} ${billingStyles.redeemCard}`}>
              <div className={`${billingStyles.cornerTag} ${billingStyles.redeemCornerTag}`}>
                <Zap size={12} />
                <span>{t('billing.redeemCornerTag')}</span>
              </div>
              <div className={`${billingStyles.actionHeader} ${billingStyles.redeemHeader}`}>
                <span className={`${billingStyles.stepBadge} ${billingStyles.redeemBadge}`}>STEP 02</span>
                <span>{t('billing.redeemTitle')}</span>
              </div>
              {status && (
                <div
                  className={`${billingStyles.status} ${
                    status.type === 'success' ? billingStyles.statusSuccess : billingStyles.statusError
                  }`}
                >
                  {status.type === 'success' ? (
                    <CheckCircle2 className={billingStyles.statusIconSuccess} size={16} />
                  ) : (
                    <AlertCircle className={billingStyles.statusIconError} size={16} />
                  )}
                  <div>{status.text}</div>
                </div>
              )}
              <form
                className={billingStyles.redeemForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleRedeem();
                }}
              >
                <Input
                  className={billingStyles.codeInput}
                  value={redeemCode}
                  placeholder={t('billing.codePlaceholder')}
                  onChange={setRedeemCode}
                  suffix={
                    redeemCode ? (
                      <Button
                        type='text'
                        className={`${billingStyles.codeAction} ${billingStyles.clearAction}`}
                        onClick={() => setRedeemCode('')}
                      >
                        {t('billing.clear')}
                      </Button>
                    ) : (
                      <Button type='text' className={billingStyles.codeAction} onClick={() => void pasteCode()}>
                        <ClipboardPaste size={12} />
                        <span>{t('billing.paste')}</span>
                      </Button>
                    )
                  }
                />
                <Button type='text' htmlType='submit' className={billingStyles.redeemButton} loading={redeeming}>
                  {redeeming ? (
                    <span>{t('billing.redeeming')}</span>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>{t('billing.redeem')}</span>
                    </>
                  )}
                </Button>
              </form>
            </section>
          </aside>
        </div>

        <section className={billingStyles.historyCard}>
          <div className={billingStyles.historyHeader}>
            <div className={billingStyles.historyTitle}>
              <History size={16} />
              <h4>{t('billing.historyTitle')}</h4>
            </div>
            <span className={billingStyles.historyNote}>{t('billing.historyNote')}</span>
          </div>
          <div className={billingStyles.historyList}>
            <div className={billingStyles.historyEmpty}>{t('billing.historyEmpty')}</div>
          </div>
        </section>
      </main>

      <footer className={billingStyles.footer}>{t('billing.footer')}</footer>
    </div>
  );
};

export default BillingPage;
