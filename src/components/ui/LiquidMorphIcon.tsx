import React, { useEffect, useRef } from 'react';
import { View, Animated as RNAnimated, Easing as RNEasing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { interpolate } from 'flubber';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { theme } from '@/styles/theme';

const PATHS = {
    journal: "M22 2C22 2 14.36 1.63 8.34 9.88C3.72 16.21 2 22 2 22C2.6467 21.6667 3.2933 21.3333 3.94 21C5.38 18.5 6.13 17.47 7.54 16C10.07 16.74 12.71 16.65 15 14C13 13.44 11.4 13.57 9.04 13.81C11.69 12 13.5 11.6 16 12C16.3333 11.3333 16.6667 10.6667 17 10C15.2 9.66 14 9.63 12.22 10.04C14.19 8.65 15.56 7.87 18 8C18.4033 7.3567 18.8067 6.7133 19.21 6.07C17.65 5.96 16.71 6.13 14.92 6.57C16.53 5.11 18 4.45 20.14 4.32C20.14 4.32 21.19 2.43 22 2C22 2 22 2 22 2",
    circles: "M12 5C10.067 5 8.5 6.567 8.5 8.5C8.5 10.433 10.067 12 12 12C13.933 12 15.5 10.433 15.5 8.5C15.5 6.567 13.933 5 12 5M12 7C12.8284 7 13.5 7.6716 13.5 8.5C13.5 9.3284 12.8284 10 12 10C11.1716 10 10.5 9.3284 10.5 8.5C10.5 7.6716 11.1716 7 12 7M5.5 8C4.1193 8 3 9.1193 3 10.5C3 11.44 3.53 12.25 4.29 12.68C4.65 12.88 5.06 13 5.5 13C5.94 13 6.35 12.88 6.71 12.68C7.08 12.47 7.39 12.17 7.62 11.81C6.89 10.86 6.5 9.7 6.5 8.5C6.5 8.41 6.5 8.31 6.5 8.22C6.2 8.08 5.86 8 5.5 8M18.5 8C18.14 8 17.8 8.08 17.5 8.22C17.5 8.31 17.5 8.41 17.5 8.5C17.5 9.7 17.11 10.86 16.38 11.81C16.5 12 16.63 12.15 16.78 12.3C16.94 12.45 17.1 12.58 17.29 12.68C17.65 12.88 18.06 13 18.5 13C18.94 13 19.35 12.88 19.71 12.68C20.47 12.25 21 11.44 21 10.5C21 9.1193 19.8807 8 18.5 8M12 14C9.66 14 5 15.17 5 17.5C5 18 5 18.5 5 19C9.6667 19 14.3333 19 19 19C19 18.5 19 18 19 17.5C19 15.17 14.34 14 12 14M4.71 14.55C2.78 14.78 0 15.76 0 17.5C0 18 0 18.5 0 19C1 19 2 19 3 19C3 18.3567 3 17.7133 3 17.07C3 16.06 3.69 15.22 4.71 14.55M19.29 14.55C20.31 15.22 21 16.06 21 17.07C21 17.7133 21 18.3567 21 19C22 19 23 19 24 19C24 18.5 24 18 24 17.5C24 15.76 21.22 14.78 19.29 14.55M12 16C13.53 16 15.24 16.5 16.23 17C13.41 17 10.59 17 7.77 17C8.76 16.5 10.47 16 12 16C12 16 12 16 12 16",
    vlog: "M18 14.5C18 13.3333 18 12.1667 18 11C18 10.4477 17.5523 10 17 10C16.6667 10 16.3333 10 16 10C18.24 8.39 18.76 5.27 17.15 3C15.54 0.78 12.42 0.26 10.17 1.87C9.5 2.35 8.96 3 8.6 3.73C6.25 2.28 3.17 3 1.72 5.37C0.28 7.72 1 10.8 3.36 12.25C3.57 12.37 3.78 12.5 4 12.58C4 15.3867 4 18.1933 4 21C4 21.5523 4.4477 22 5 22C9 22 13 22 17 22C17.5523 22 18 21.5523 18 21C18 19.8333 18 18.6667 18 17.5C19.3333 18.8333 20.6667 20.1667 22 21.5C22 17.8333 22 14.1667 22 10.5C20.6667 11.8333 19.3333 13.1667 18 14.5M13 4C14.1046 4 15 4.8954 15 6C15 7.1046 14.1046 8 13 8C11.8954 8 11 7.1046 11 6C11 4.8954 11.8954 4 13 4M6 6C7.1046 6 8 6.8954 8 8C8 9.1046 7.1046 10 6 10C4.8954 10 4 9.1046 4 8C4 6.8954 4.8954 6 6 6C6 6 6 6 6 6",
    checkin: "M7 17C8.0667 14.7333 9.1333 12.4667 10.2 10.2C12.4667 9.1333 14.7333 8.0667 17 7C15.9333 9.2667 14.8667 11.5333 13.8 13.8C11.5333 14.8667 9.2667 15.9333 7 17M12 11.1C11.5029 11.1 11.1 11.5029 11.1 12C11.1 12.4971 11.5029 12.9 12 12.9C12.4971 12.9 12.9 12.4971 12.9 12C12.9 11.5029 12.4971 11.1 12 11.1M12 2C17.5228 2 22 6.4772 22 12C22 17.5228 17.5228 22 12 22C6.4772 22 2 17.5228 2 12C2 6.4772 6.4772 2 12 2M12 4C7.5817 4 4 7.5817 4 12C4 16.4183 7.5817 20 12 20C16.4183 20 20 16.4183 20 12C20 7.5817 16.4183 4 12 4C12 4 12 4 12 4",
};

const SAFE_DOT = "M11.9 11.9C12.1 11.9 12.1 12.1 11.9 12.1Z";

const parseShapes = (pathStr: string) => {
    const parts = pathStr.split(/(?=[M|m])/g).filter(s => !!s.trim() && s.length > 5);
    while (parts.length < 8) parts.push(SAFE_DOT);
    return parts;
};

type Mode = keyof typeof PATHS;

interface Props {
    mode: Mode;
    size?: number;
    color?: string;
    style?: any;
    customCheckinIcon?: string;
}

function sanitizePath(pathStr: string) {
    // 1. replace any "NaN" with "12"
    pathStr = pathStr.replace(/NaN/gi, "12");
    // 2. format e-notation parsing (e.g. 1.2e-14 -> 0)
    pathStr = pathStr.replace(/[-+]?\d*\.?\d+e[-+]?\d+/ig, "0");
    // 3. limit float decimals to max 2 decimal places to prevent buffer overloads
    pathStr = pathStr.replace(/([-+]?\d*\.\d{3,})/g, (val) => Number(val).toFixed(2));
    return pathStr;
}

export const LiquidMorphIcon: React.FC<Props> = ({ mode, size = 42, color = theme.colors.primaryAction, style }) => {
    const previousModeRef = useRef<Mode>(mode);
    const pathStringRef = useRef<string>(PATHS[mode]);
    const pathRef = useRef<any>(null);

    // Using traditional React Native Animated internally because we want to use d3 interpolators sequentially
    const animationProgress = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        if (mode !== previousModeRef.current) {
            // Lock interpolation boundaries strongly to stable static SVGs. 
            // Parsing mid-morph 'mangly' strings causes d3 interpolation to inject NaN arrays due to coordinate collapse.
            const startShapes = parseShapes(PATHS[previousModeRef.current]);
            const targetShapes = parseShapes(PATHS[mode]);
            
            // Generate independent topological morphs for every subpath piece simultaneously
            const interpolators = startShapes.map((shape, i) => 
                interpolate(shape, targetShapes[i], { maxSegmentLength: 2 })
            );
            
            // Stop prior active animation forcefully
            animationProgress.stopAnimation();
            animationProgress.setValue(0);
            
            // Remove previous listeners just in case
            animationProgress.removeAllListeners();
            
            const listenerId = animationProgress.addListener(({ value }: { value: number }) => {
                let newPath = interpolators.map(fn => fn(value)).join(' ');
                // Sanitize before hitting Android Java parser
                newPath = sanitizePath(newPath);

                pathStringRef.current = newPath;
                if (pathRef.current) {
                    // Update native path without any React re-render queueing -> 60fps stable execution
                    pathRef.current.setNativeProps({ d: newPath });
                }
            });

            RNAnimated.timing(animationProgress, {
                toValue: 1,
                duration: 500,
                easing: RNEasing.inOut(RNEasing.cubic),
                useNativeDriver: false,
            }).start(({ finished }) => {
                if (finished) {
                    animationProgress.removeListener(listenerId);
                    previousModeRef.current = mode;
                    
                    const joinedTargetPath = targetShapes.join(' ');
                    pathStringRef.current = joinedTargetPath; // Lock target
                    if (pathRef.current) {
                        pathRef.current.setNativeProps({ d: joinedTargetPath }); 
                    }
                }
            });
        }
    }, [mode]);

    // Outer subtle unified pulse container
    const scaleValue = useSharedValue(1);
    
    useEffect(() => {
        scaleValue.value = withTiming(1.15, { duration: 250 }, () => {
            scaleValue.value = withSpring(1, { damping: 10, mass: 0.5 });
        });
    }, [mode]);

    const animatedBoxStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scaleValue.value }],
    }));

    // For Typescript and typing checking on SVG
    return (
        <Animated.View style={[animatedBoxStyle, style]}>
            <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
                <Svg width={size} height={size} viewBox="0 0 24 24">
                    <Path
                        ref={pathRef}
                        d={pathStringRef.current}
                        fill={color}
                    />
                </Svg>
            </View>
        </Animated.View>
    );
};
