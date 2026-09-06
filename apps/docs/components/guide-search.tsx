'use client';

import { useDocsSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog, SearchDialogClose, SearchDialogContent, SearchDialogHeader,
  SearchDialogIcon, SearchDialogInput, SearchDialogList, SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';

export default function GuideSearch(props: SharedProps) {
  // This guide has one Arabic index and unprefixed URLs. The UI locale is not an index key.
  const { search, setSearch, query } = useDocsSearch({ type: 'static', from: '/api/search' });
  return <SearchDialog {...props} search={search} onSearchChange={setSearch} isLoading={query.isLoading}>
    <SearchDialogOverlay />
    <SearchDialogContent>
      <SearchDialogHeader>
        <SearchDialogIcon />
        <SearchDialogInput />
        <SearchDialogClose />
      </SearchDialogHeader>
      {query.error ? <p role="alert" className="px-4 py-6 text-sm text-fd-muted-foreground">تعذّر تحميل فهرس الدليل. أعد تحميل الصفحة ثم حاول البحث مجدداً.</p>
        : <SearchDialogList items={query.data === 'empty' ? null : query.data} />}
    </SearchDialogContent>
  </SearchDialog>;
}
