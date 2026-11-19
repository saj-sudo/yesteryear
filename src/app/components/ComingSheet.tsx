import { useEffect, useRef } from 'preact/hooks';
import type { AppData } from '../App';
import { Recall } from '../views/Recall';

/**
 * "What is coming": the Recall schedule as a sheet over Today. A native
 * dialog gives the focus trap, the Escape key and the backdrop without
 * any script of our own.
 */
export function ComingSheet(props: { data: AppData; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-labelledby="coming-heading"
      onClose={props.onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div class="sheet-body">
        <button class="quiet sheet-close" onClick={() => ref.current?.close()}>
          Close
        </button>
        {props.open && <Recall data={props.data} />}
      </div>
    </dialog>
  );
}
