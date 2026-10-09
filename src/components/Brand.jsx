export default function Brand({ light = false, compact = false }) {
  return (
    <span className={`brand-lockup${light ? ' brand-lockup--light' : ''}${compact ? ' brand-lockup--compact' : ''}`}>
      <img className="brand-lockup__mark" src="/brand-mark.svg" alt="" width="38" height="38" />
      <span className="brand-lockup__words">
        <strong>旅帧</strong>
        <span>ROAMFRAME</span>
      </span>
    </span>
  );
}
