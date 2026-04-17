import React from 'react';
import { View, Text } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { AnimatedScaleButton } from '@/components/ui/AnimatedScaleButton';
import { commonStyles } from '@/styles/commonStyles';

interface Props {
    lossOverlayOpacity: SharedValue<number>;
    hasLost: boolean;
    subtitle: string;
    primaryLabel: string;
    secondaryLabel: string;
    onReturnHome: () => void;
    onContinueWriting: () => void;
    /** Optional extra actions rendered between the two buttons */
    extraActions?: React.ReactNode;
}

export const DeathOverlay = React.memo(function DeathOverlay({
    lossOverlayOpacity,
    hasLost,
    subtitle,
    primaryLabel,
    secondaryLabel,
    onReturnHome,
    onContinueWriting,
    extraActions,
}: Props) {
    const animatedOpacityStyle = useAnimatedStyle(() => ({
        opacity: lossOverlayOpacity.value,
    }));

    return (
        <Animated.View pointerEvents={hasLost ? 'auto' : 'none'} style={[commonStyles.deathOverlayLayer, animatedOpacityStyle]}>
            {hasLost && (
                <View style={commonStyles.deathContentBox}>
                    <Text style={commonStyles.deathGiant}>YOU DIED</Text>
                    <Text style={commonStyles.deathSub}>{subtitle}</Text>

                    <AnimatedScaleButton style={commonStyles.deathBtnMaster} onPress={onReturnHome}>
                        <Text style={commonStyles.deathBtnMasterText}>{primaryLabel}</Text>
                    </AnimatedScaleButton>

                    <AnimatedScaleButton style={commonStyles.deathBtnSecondary} onPress={onContinueWriting}>
                        <Text style={commonStyles.deathBtnSecondaryText}>{secondaryLabel}</Text>
                    </AnimatedScaleButton>

                    {extraActions}
                </View>
            )}
        </Animated.View>
    );
});