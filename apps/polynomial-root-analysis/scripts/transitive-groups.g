# transitive-groups.g — dump GAP's transitive-groups library for degrees 2..15 as JSON (ADR-0047 PRA-5).
# Run by generate-transitive-groups.mjs; never edit the JSON it writes by hand.
#
# Per group: label nTj, GAP's name, order, parity, solvability, primitivity, generators (0-based image
# lists), and the number of elements of each cycle type (from the conjugacy classes). For degree <= 7
# also every class of MAXIMAL TRANSITIVE subgroup, with a representative's generators and the
# permutation pi taking the standard nTj onto it (K = pi o H o pi^-1, as maps i -> i^p).
LoadPackage("transgrp");
# Class computations are randomised; a fixed seed makes the run (and its time) reproducible.
Reset(GlobalMersenneTwister, 1);
Reset(GlobalRandomSource, 1);

JStr := function(s) return Concatenation("\"", ReplacedString(String(s), "\"", "'"), "\""); end;
JList := function(l) return Concatenation("[", JoinStringsWithSeparator(List(l, String), ","), "]"); end;
PtImages := function(g, n) return List([1..n], i -> i^g - 1); end;
JGens := function(gens, n) return Concatenation("[", JoinStringsWithSeparator(List(gens, g -> JList(PtImages(g, n))), ","), "]"); end;

JTypes := function(types)
  return JoinStringsWithSeparator(List(RecNames(types), k -> Concatenation(JStr(k), ":", String(types.(k)))), ",");
end;

TypeKey := function(g, n)
  local cs, t, i, k;
  cs := CycleStructurePerm(g); t := [];
  for i in [Length(cs), Length(cs)-1 .. 1] do
    if IsBound(cs[i]) then for k in [1..cs[i]] do Add(t, i+1); od; fi;
  od;
  k := n - Sum(t);
  for i in [1..k] do Add(t, 1); od;
  return JoinStringsWithSeparator(List(t, String), ".");
end;

out := OutputTextFile(OUTFILE, false);
SetPrintFormattingStatus(out, false);
PrintTo(out, "{");
for n in [2..15] do
  AppendTo(out, "\"", n, "\":[");
  for j in [1..NrTransitiveGroups(n)] do
    G := TransitiveGroup(n, j);
    gens := GeneratorsOfGroup(G);
    if gens = [] then gens := [()]; fi;
    types := rec();
    for c in ConjugacyClasses(G) do
      key := TypeKey(Representative(c), n);
      if IsBound(types.(key)) then types.(key) := types.(key) + Size(c); else types.(key) := Size(c); fi;
    od;
    tstr := JTypes(types);
    AppendTo(out, "{\"label\":", JStr(Concatenation(String(n), "T", String(j))),
      ",\"gapName\":", JStr(Name(G)),
      ",\"order\":", JStr(Size(G)),
      ",\"even\":", String(IsSubset(AlternatingGroup(n), G)),
      ",\"solvable\":", String(IsSolvableGroup(G)),
      ",\"primitive\":", String(IsPrimitive(G, [1..n])),
      ",\"generators\":", JGens(gens, n),
      ",\"cycleTypes\":{", tstr, "}");
    if n <= 7 then
      maxs := [];
      for K in MaximalSubgroupClassReps(G) do
        if IsTransitive(K, [1..n]) then
          i := TransitiveIdentification(K);
          p := RepresentativeAction(SymmetricGroup(n), TransitiveGroup(n, i), K);
          kg := GeneratorsOfGroup(K); if kg = [] then kg := [()]; fi;
          Add(maxs, Concatenation("{\"label\":", JStr(Concatenation(String(n), "T", String(i))),
            ",\"generators\":", JGens(kg, n), ",\"conj\":", JList(PtImages(p, n)), "}"));
        fi;
      od;
      AppendTo(out, ",\"maximalTransitive\":[", JoinStringsWithSeparator(maxs, ","), "]");
    fi;
    AppendTo(out, "}");
    if j < NrTransitiveGroups(n) then AppendTo(out, ","); fi;
  od;
  AppendTo(out, "]");
  if n < 15 then AppendTo(out, ","); fi;
od;
AppendTo(out, "}");
CloseStream(out);
QUIT;
