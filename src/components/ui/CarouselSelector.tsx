import React, { useRef } from 'react';
import { View, Text, Dimensions } from 'react-native';
import Carousel from 'react-native-reanimated-carousel';
import { commonStyles } from '@/styles/commonStyles';
import { theme } from '@/styles/theme';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
    label: string;
    data: any[];
    selectedIndex: number;
    onSelect: (index: number) => void;
    renderItemText: (item: any) => React.ReactNode;
    onInteractionStart?: () => void;
    onInteractionEnd?: () => void;
}

/**
 * CarouselSelector — Horizontal scrollable picker with arrow nav and dot indicators.
 * Uses AnimatedScaleButton for all interactive elements for premium tactile feel.
 */
export const CarouselSelector: React.FC<Props> = React.memo(({ label, data, selectedIndex, onSelect, renderItemText, onInteractionStart, onInteractionEnd }) => {
    const CAROUSEL_WIDTH = Math.min(SCREEN_WIDTH * 0.5, 200);
    const carouselRef = useRef<any>(null);

    const prev = () => {
        const newIdx = Math.max(0, selectedIndex - 1);
        carouselRef.current?.scrollTo({ count: -1, animated: true });
        onSelect(newIdx);
    };

    const next = () => {
        const newIdx = Math.min(data.length - 1, selectedIndex + 1);
        carouselRef.current?.scrollTo({ count: 1, animated: true });
        onSelect(newIdx);
    };

    return (
        <View style={commonStyles.carouselWrapper}>
            <Text style={commonStyles.carouselLabel}>{label}</Text>
            <View style={commonStyles.carouselControlRow}>
                <AnimatedScaleButton style={commonStyles.carouselArrowBtn} onPress={prev}>
                    <Text style={commonStyles.carouselArrowText}>{"<"}</Text>
                </AnimatedScaleButton>

                <View
                    style={{ width: CAROUSEL_WIDTH, height: 60 }}
                    onTouchStart={onInteractionStart}
                    onTouchEnd={onInteractionEnd}
                    onTouchCancel={onInteractionEnd}
                >
                    <Carousel
                        ref={carouselRef}
                        loop={false}
                        width={CAROUSEL_WIDTH}
                        height={60}
                        autoPlay={false}
                        data={data}
                        defaultIndex={selectedIndex}
                        scrollAnimationDuration={500}
                        onSnapToItem={onSelect}
                        renderItem={({ item }) => (
                            <View style={[commonStyles.carouselItem, { width: CAROUSEL_WIDTH, height: 60 }]}>
                                {renderItemText(item)}
                            </View>
                        )}
                    />
                </View>

                <AnimatedScaleButton style={commonStyles.carouselArrowBtn} onPress={next}>
                    <Text style={commonStyles.carouselArrowText}>{">"}</Text>
                </AnimatedScaleButton>
            </View>

            <View style={commonStyles.dotRow}>
                {data.map((_, idx) => (
                    <AnimatedScaleButton
                        key={idx}
                        style={{ padding: 10 }}
                        onPress={() => {
                            carouselRef.current?.scrollTo({ index: idx, animated: true });
                            onSelect(idx);
                        }}
                    >
                        <View style={[commonStyles.dot, selectedIndex === idx && { backgroundColor: theme.colors.danger }]} />
                    </AnimatedScaleButton>
                ))}
            </View>
        </View>
    );
});
