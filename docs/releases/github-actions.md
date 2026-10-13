# GitHub Actions Release Procedure

## Release candidate

1. Open the repository's **Actions** tab.
2. Select the **Release** workflow.
3. Choose **Run workflow**.
4. Enter the source branch, normally `feat/v2.0.0-support` for the first RC.
5. Enter the exact version, for example:

   ```text
   2.0.0-rc.1
   ```

6. Run the workflow.

The workflow creates a release branch, updates `package.json`, runs the build,
pushes the branch, and opens a release pull request. Review and merge that pull
request into `main`.

When the version commit reaches `main`, the Publish workflow runs automatically.
For a prerelease version it:

- creates the `v2.0.0-rc.1` Git tag;
- creates a GitHub prerelease;
- publishes npm with the `rc` dist-tag.

Install the candidate with:

```bash
npm install opencode-models-discovery@rc
```

## Stable release

Run the same workflow with:

```text
2.0.0
```

After merging the generated release pull request, the Publish workflow creates
the normal GitHub release and publishes npm with the `latest` dist-tag.

## Important rules

- Use a new prerelease number for each RC: `2.0.0-rc.1`, then `2.0.0-rc.2`.
- Do not reuse a version already published to npm.
- Do not manually run `npm publish`; the Publish workflow uses trusted
  publishing and the correct `rc` or `latest` dist-tag automatically.
- The release workflow does not publish npm directly. Publishing happens after
  the release PR is merged into `main`.
