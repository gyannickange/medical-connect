# Flatten CouchDB Database Infrastructure

## Goal

Move the CouchDB infrastructure files from `backend/src/database/couchdb/` directly into `backend/src/database/` without changing runtime behavior or public APIs.

## File layout

The following files move unchanged except for relative imports:

- `couchdb.service.ts`
- `couchdb.service.spec.ts`
- `couchdb.module.ts`
- `couchdb-naming.ts`
- `couchdb-naming.spec.ts`

The empty `backend/src/database/couchdb/` directory is removed afterward.

## Imports

All backend modules, repositories, scripts, and tests importing from `database/couchdb/*` will import the corresponding file from `database/*`. Imports internal to the moved files remain local sibling imports.

## Behavior and compatibility

This is a structural refactor only. Provider names, exported classes and functions, CouchDB database naming, document identifiers, indexes, design documents, and HTTP behavior remain unchanged.

## Verification

Completion requires:

- no remaining `database/couchdb` imports;
- no files remaining under `backend/src/database/couchdb/`;
- backend unit tests passing;
- backend build and script type-check passing;
- `git diff --check` passing.
