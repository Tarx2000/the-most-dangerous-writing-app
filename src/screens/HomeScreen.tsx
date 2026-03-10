import React, { useRef, useState } from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { StartScreen } from './StartScreen';
import { LibraryScreen } from './LibraryScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const { width, height } = Dimensions.get('window');

export const HomeScreen: React.FC<Props> = ({ navigation, route }) => {
    const scrollViewRef = useRef<ScrollView>(null);
    const [scrollEnabled, setScrollEnabled] = useState(true);

    // Callbacks passed to children so they can manually trigger scrolls
    const goToLibrary = () => {
        scrollViewRef.current?.scrollTo({ x: width, animated: true });
    };

    const goToStart = () => {
        scrollViewRef.current?.scrollTo({ x: 0, animated: true });
    };

    return (
        <View style={styles.container}>
            <ScrollView
                ref={scrollViewRef}
                horizontal
                pagingEnabled
                scrollEnabled={scrollEnabled}
                bounces={false}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.scrollView}
            >
                {/* 
                  We mount StartScreen and LibraryScreen dynamically.
                  Note: Since they were originally Stack screens, they expect `navigation` and `route` props.
                  We still pass the parent stack navigation to them so they can push to 'Writing'. 
                */}
                <View style={styles.page}>
                    <StartScreen
                        navigation={navigation}
                        route={route as any}
                        onGoToLibrary={goToLibrary}
                        setHomeScrollEnabled={setScrollEnabled}
                    />
                </View>
                <View style={styles.page}>
                    <LibraryScreen
                        navigation={navigation}
                        route={route as any}
                        onGoToStart={goToStart}
                    />
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollView: {
        flex: 1,
    },
    page: {
        width, // Force each child column to be exactly screen width
        height: '100%',
    }
});
