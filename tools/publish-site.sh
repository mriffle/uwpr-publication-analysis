#!/usr/bin/env bash
#
# Publish to the `gh-pages` branch (docs/07-operations.md O1, O2, §4.2).
#
# Two callers, two disjoint halves of one branch:
#
#   publish-site.sh app  web/dist   # replace the app files; leave data/ alone
#   publish-site.sh data export     # replace data/*.json; leave the app alone
#
# §4.2: "The data copy must touch only the export files, and the app deploy must touch only the
# app files. Neither may clobber the other." That is the whole reason this is a script and not
# two `cp` lines: the app deploy has to delete what a build dropped, and deleting "everything
# else" is exactly how it would take the weekly data with it.
#
# It works on the checkout it is run from, through a linked worktree, so it inherits the
# credentials `actions/checkout` left in the repository config and never handles a token itself.
# The branch is created on first use, as an orphan, because a built site has no shared history
# with `main`.
#
# The push is retried: `pages.yml` and `update.yml` can run at the same time, and because each
# rewrites only its own half, re-applying onto a freshly fetched tip is always the right answer.

set -euo pipefail

usage() {
	echo "usage: $0 (app|data) SOURCE_DIR" >&2
	exit 2
}

[ $# -eq 2 ] || usage
what=$1
source_dir=$2
case "$what" in
app | data) ;;
*) usage ;;
esac
[ -d "$source_dir" ] || {
	echo "::error::$source_dir is not a directory"
	exit 1
}

branch=${SITE_BRANCH:-gh-pages}
remote=${SITE_REMOTE:-origin}
# The app fetches its data from `<base>/data/` (docs/06 §13; web/src/contract/config.ts joins the
# base path, VITE_DATA_PATH and the file name). Change one, change the other.
data_dir=${SITE_DATA_DIR:-data}
name=${SITE_COMMITTER_NAME:-github-actions[bot]}
email=${SITE_COMMITTER_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}

root=$(git rev-parse --show-toplevel)
sha=${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD)}
if [ "$what" = app ]; then
	message=${SITE_MESSAGE:-"Deploy the app from ${sha:0:12}"}
else
	message=${SITE_MESSAGE:-"Publish the export from ${sha:0:12}"}
fi

tree=$(mktemp -d "${TMPDIR:-/tmp}/gh-pages.XXXXXX")
# shellcheck disable=SC2329  # invoked by the trap below, which shellcheck does not follow
cleanup() {
	git -C "$root" worktree remove --force "$tree" >/dev/null 2>&1 || true
	rm -rf "$tree"
}
trap cleanup EXIT

# Check out the branch's current tip, or start an empty one. `--detach` throughout: a linked
# worktree holding the branch would collide with a second run, and the push names the ref anyway.
checkout_branch() {
	rm -rf "$tree"
	git -C "$root" fetch --no-tags "$remote" "+refs/heads/$branch:refs/remotes/$remote/$branch" 2>/dev/null ||
		echo "no $branch on $remote yet; it will be created"
	if git -C "$root" rev-parse --verify --quiet "refs/remotes/$remote/$branch" >/dev/null; then
		git -C "$root" worktree add --detach "$tree" "refs/remotes/$remote/$branch" >/dev/null
	else
		git -C "$root" worktree add --detach "$tree" >/dev/null
		git -C "$tree" checkout --orphan "$branch" >/dev/null 2>&1
		git -C "$tree" rm -rq --cached . >/dev/null 2>&1 || true
		find "$tree" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
	fi
}

apply_app() {
	# Everything but the data and the worktree's own `.git` link file. `--delete` semantics by
	# hand, so that a file the build no longer produces does not linger on the branch.
	find "$tree" -mindepth 1 -maxdepth 1 ! -name .git ! -name "$data_dir" -exec rm -rf {} +
	cp -R "$source_dir"/. "$tree"/
}

apply_data() {
	# Only the two export files, named (docs/07 §4.2). Anything else on the branch is the app's.
	mkdir -p "$tree/$data_dir"
	local copied=0
	for file in "$source_dir"/*.json; do
		[ -f "$file" ] || continue
		cp "$file" "$tree/$data_dir/"
		copied=$((copied + 1))
	done
	[ "$copied" -gt 0 ] || {
		echo "::error::no JSON files in $source_dir"
		exit 1
	}
}

for attempt in 1 2 3; do
	checkout_branch
	if [ "$what" = app ]; then apply_app; else apply_data; fi

	git -C "$tree" add --all
	if git -C "$tree" diff --cached --quiet; then
		echo "$branch is already up to date; nothing to publish"
		exit 0
	fi
	git -C "$tree" -c "user.name=$name" -c "user.email=$email" commit -q -m "$message"

	if git -C "$tree" push "$remote" "HEAD:refs/heads/$branch"; then
		echo "published $what to $branch: $(git -C "$tree" rev-parse --short HEAD)"
		exit 0
	fi
	echo "push to $branch rejected (attempt $attempt); re-applying onto its new tip"
	git -C "$root" worktree remove --force "$tree" >/dev/null 2>&1 || true
	sleep $((attempt * 5))
done

echo "::error::could not publish $what to $branch after 3 attempts"
exit 1
