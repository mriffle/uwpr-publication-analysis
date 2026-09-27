/**
 * The method page's funding section end to end (docs/09 §12.9; docs/06 §4.2, §9, §12.2).
 *
 * What only a real browser and a real build can show: a funding figure's definition reached by
 * fragment on a cold load, which is how the Funding impact view's figures link to it (the app
 * boots after the browser's own fragment handling has found nothing); NLM's phrase actually
 * visible, since its terms ask for it "in a clear and conspicuous manner"; and axe against
 * resolved colours in both themes, with the section on the page.
 *
 * Nothing is hard-coded: the dates and names come from whatever export the preview server serves
 * — `samples/export/` by default, the real one under `UWPR_EXPORT_DIR`.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

interface ExportDocument {
  resource: { short_name: string };
  /** Absent in a 1.0 export; its `version` is null in a 1.1 export with no funding data. */
  funding?: {
    version: string | null;
    sources: { id: string; name: string; as_of: string }[];
    /** Contract 1.2's counting rule and counted totals (docs/09 F17). */
    counting?: { from_year: number };
    summary?: {
      amount_usd: number;
      counted_usd: number;
      grants_by_counted_rule?: Record<string, number>;
    };
  } | null;
}

/** Whole US dollars, as the app writes them: "$5,139,499,698". */
const usd = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

async function readExport(page: Page): Promise<ExportDocument> {
  const response = await page.request.get('/data/uwpr_publications.json');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ExportDocument;
}

const hasFunding = (doc: ExportDocument): boolean => (doc.funding?.version ?? null) !== null;

const section = (page: Page) =>
  page.getByRole('region', { name: 'How the funding figures are assembled' });

test.describe('the funding section', () => {
  test('a funding figure’s definition resolves by fragment from cold, and takes focus', async ({
    page,
  }) => {
    const doc = await readExport(page);
    test.skip(!hasFunding(doc), 'This export carries no funding data, so it has no definitions.');

    await page.goto('/method#funding-total');
    const definition = page.locator('#funding-total');
    await expect(definition).toBeVisible();
    await expect(definition).toBeFocused();
    await expect(definition).toContainText('not money spent on this work');
    await expect(section(page)).toContainText('Courtesy of the U.S. National Library of Medicine.');
  });

  test('the section is there, and says so when the export has no funding data', async ({
    page,
  }) => {
    const doc = await readExport(page);
    await page.goto('/method');
    await expect(section(page)).toBeVisible();
    if (!hasFunding(doc)) {
      await expect(section(page)).toContainText('This export carries no funding data');
      return;
    }
    const pubmed = doc.funding?.sources.find((source) => source.id === 'pubmed');
    if (pubmed !== undefined) {
      await expect(
        section(page).getByText('Courtesy of the U.S. National Library of Medicine.'),
      ).toBeVisible();
    }
    for (const source of doc.funding?.sources ?? []) {
      await expect(
        section(page).getByRole('link', { name: source.name, exact: true }),
      ).toBeVisible();
    }
  });

  test('how grant funding is counted resolves by fragment from cold, with the export’s figures', async ({
    page,
  }) => {
    const doc = await readExport(page);
    test.skip(!hasFunding(doc), 'This export carries no funding data, so nothing is counted.');
    const summary = doc.funding?.summary;
    const from = String(doc.funding?.counting?.from_year ?? '');

    await page.goto('/method#funding-counting');
    const heading = page.locator('#funding-counting');
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(heading).toHaveText('How grant funding is counted');
    await expect(section(page)).toContainText(
      `The rule: each grant counts its funding from ${from}, when ${doc.resource.short_name} began, through the year of the latest publication listing it.`,
    );
    const window = summary?.grants_by_counted_rule?.window ?? 0;
    if (window > 0) await expect(section(page)).toContainText(`${String(window)} grant`);
    await expect(section(page)).toContainText(
      `the lifetime totals come to ${usd(summary?.amount_usd ?? 0)} and the counted amounts to ${usd(summary?.counted_usd ?? 0)}`,
    );
  });

  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${theme} theme`, () => {
      test.use({ colorScheme: theme });

      for (const fragment of ['funding', 'funding-counting']) {
        test(`the method page, opened at #${fragment}, passes axe`, async ({ page }) => {
          test.setTimeout(30_000);
          await page.goto(`/method#${fragment}`);
          await expect(section(page)).toBeVisible();
          const { violations } = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
          expect(
            violations.map(
              (violation) =>
                `${violation.id}: ${violation.help} (${violation.nodes
                  .map((node) => JSON.stringify(node.target))
                  .join(', ')})`,
            ),
          ).toEqual([]);
        });
      }
    });
  }
});
