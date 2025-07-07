## CommitLint rules

Commit guidelines based on [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and [Angular commit conventions](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#-commit-message-guidelines).

### Rules

* Commit format:
  ```
  <type>[(optional scope)]: <subject>

  [optional body]

  [optional footer]
  ```
* Type:
    * required
    * only in lower case
    * one of:
      * build - changes that affect the build system or external dependencies
      * chore - changes in tools, build, configurations without affecting production
      * ci - changes to our CI configuration files and scripts
      * docs - documentation only changes
      * feat - a new feature (technical or real)
      * fix - a bug fix
      * perf - a code change that improves performance
      * refactor - a code change that neither fixes a bug nor adds a feature
      * revert - revert of commit
      * style - changes that do not affect the meaning of the code
      * test - adding missing tests or correcting existing tests
* Scope:
    * optional
    * only in lower case
    * must consist of a noun describing a section of the codebase, can be:
      * a class or component
      * a file name
      * a directory name
      * a namespace
      * a tool name
      * a name of dependency
      * another part of codebase
* Subject:
    * use the imperative, present tense: "change" not "changed" nor "changes"
    * must start from lower case
    * no dot at the end
* Max header length
    * recommended: no more than 50 characters
    * error on 72+ characters
* Body:
    * use the imperative, present tense: "change" not "changed" nor "changes"
    * max line length: 72 characters
* Footer:
    * max line length: 72 characters
