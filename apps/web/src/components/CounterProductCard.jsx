import { CarFront, Check, Droplets, Fuel, PackageOpen, Plus, Wrench } from 'lucide-react';
import { t, useLocale } from '../context/LocaleContext.jsx';
import { categories, money, validAmount } from '../lib/store.js';
import { ProductThumbnail } from './ProductPhotos.jsx';

const categoryIcons = { parts: Wrench, lubricants: Droplets, fuel: Fuel, accessories: CarFront, other: PackageOpen };

export default function CounterProductCard({ product, mode, quantity, disabled, onAdd }) {
  useLocale();
  const needsPrice = mode === 'sale' && !validAmount(product.selling_price, true);
  const outOfStock = Number(product.current_stock) <= 0;
  const soldOut = mode === 'sale' && outOfStock;
  const Icon = categoryIcons[product.category] || PackageOpen;
  const categoryLabel = categories.find(([id]) => id === product.category)?.[1] || 'Other';

  return <article className={`counter-product-card ${quantity !== undefined ? 'is-in-basket' : ''}`}>
    <div className="counter-product-visual">
      {product.photo_paths?.length
        ? <ProductThumbnail product={product} className="counter-product-image" />
        : <div className="counter-product-placeholder" aria-label={t('No saved photo')}>
          <Icon size={52} strokeWidth={1.25} aria-hidden="true" />
          <span>{t(categoryLabel)}</span>
        </div>}
      {quantity !== undefined && <span className="counter-product-selected"><Check size={14} aria-hidden="true" />{t('{v0} in basket', { v0: quantity || '—' })}</span>}
    </div>
    <div className="counter-product-content">
      <div className="min-w-0 flex-1">
        <p className="counter-part-number">{product.part_number || t('No part number')}</p>
        <h3 className="counter-product-name">{product.description}</h3>
      </div>
      <p className={`counter-product-stock ${outOfStock ? 'is-sold-out' : ''}`}>
        <span aria-hidden="true" />{outOfStock ? t('Out of stock') : t('{v0} {v1} in stock', {
          v0: Number(product.current_stock).toLocaleString('en-PH'), v1: product.unit || t('units')
        })}
      </p>
      <div className="counter-product-price">
        {mode === 'stock_in' && <span>{t('Cost per unit')}</span>}
        <strong className={needsPrice ? 'text-amber-800' : ''}>{needsPrice ? t('Price needed') : money(mode === 'sale' ? product.selling_price : product.unit_cost)}</strong>
      </div>
      <button type="button" className="btn-primary counter-add-button" onClick={() => onAdd(product)} disabled={disabled || soldOut} aria-label={t('Add {v0} to basket', { v0: product.description })}>
        <Plus size={18} className="shrink-0" aria-hidden="true" />{t('Add')}
      </button>
    </div>
  </article>;
}
