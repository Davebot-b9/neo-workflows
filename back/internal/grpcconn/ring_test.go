package grpcconn

import (
	"slices"
	"sync"
	"testing"
)

func TestRingRotatesAndCoversAll(t *testing.T) {
	r := NewRing([]string{"a", "b", "c"})

	if got := r.Order(); !slices.Equal(got, []string{"a", "b", "c"}) {
		t.Fatalf("primera vuelta = %v", got)
	}
	if got := r.Order(); !slices.Equal(got, []string{"b", "c", "a"}) {
		t.Fatalf("segunda vuelta = %v", got)
	}
	if got := r.Order(); !slices.Equal(got, []string{"c", "a", "b"}) {
		t.Fatalf("tercera vuelta = %v", got)
	}
}

func TestRingSpreadsEvenlyUnderConcurrency(t *testing.T) {
	r := NewRing([]int{0, 1})
	var mu sync.Mutex
	counts := map[int]int{}

	var wg sync.WaitGroup
	for range 1000 {
		wg.Go(func() {
			first := r.Order()[0]
			mu.Lock()
			counts[first]++
			mu.Unlock()
		})
	}
	wg.Wait()

	if counts[0] != 500 || counts[1] != 500 {
		t.Fatalf("reparto desigual: %v", counts)
	}
}

func TestSplitAddrs(t *testing.T) {
	got := SplitAddrs(" neo-model:50052, ,neo-model-2:50052 ")
	if !slices.Equal(got, []string{"neo-model:50052", "neo-model-2:50052"}) {
		t.Fatalf("SplitAddrs = %v", got)
	}
}
