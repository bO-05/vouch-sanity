import studio from '@sanity/eslint-config-studio'

export default [
  {ignores: ['dist/**', '.sanity/**']},
  ...studio,
  {
    rules: {
      // @sanity/icons v5 removed the named root exports but still types them as `never`,
      // so `tsc` passes and only the bundler fails. Catch it at lint time instead.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@sanity/icons',
              message:
                "Import each icon from its own subpath, e.g. import {InboxIcon} from '@sanity/icons/Inbox'.",
            },
          ],
        },
      ],
    },
  },
]
