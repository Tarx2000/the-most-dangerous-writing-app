/**
 * Type augmentation for @shopify/flash-list v2.0.2
 *
 * The distributed types are missing estimatedItemSize and getItemLayout
 * even though these are fully supported at runtime. This declaration
 * patch extends FlashListProps with the missing fields.
 */
import '@shopify/flash-list';

declare module '@shopify/flash-list' {
    interface FlashListProps<TItem> {
        /** Approximate size of each item for fast initial layout. FlashList
         *  corrects actual heights after measuring. */
        estimatedItemSize?: number;
        /** Optional layout precomputation to skip measurement phase.
         *  Returns {length, offset, index} for the item at given index. */
        getItemLayout?: (
            data: ArrayLike<TItem> | null | undefined,
            index: number,
        ) => { length: number; offset: number; index: number };
    }
}
