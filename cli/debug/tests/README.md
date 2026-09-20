# Debug bridge tests

## LazyContainer dimension check

Open a page that renders `LazyContainer` instances, preferably a long Explorer result list with both loaded content and placeholders, then run:

```bash
npm run debug:lazy-container
```

The test groups visible `LazyContainer` instances by their parent layout, compares rendered content and placeholder width/height, and reports the closest size differences. The default tolerance is `0`, so any measured difference fails the check. Use `--tolerance=0.5` only when validating a page that intentionally permits subpixel differences, or use `--require-pair` to fail when the current page does not contain both content and placeholder instances in the same layout group.
