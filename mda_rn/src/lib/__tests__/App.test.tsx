import React from 'react';
// @ts-expect-error - react-test-renderer may not have types resolved in some workspaces
import renderer, { act } from 'react-test-renderer';
import App from '../../../App';

describe('App Startup Integration', () => {
    it('renders the root App tree without throwing a startup error', async () => {
        let tree;
        await act(async () => {
            tree = renderer.create(<App />);
        });
        expect(tree).toBeDefined();
    });
});
